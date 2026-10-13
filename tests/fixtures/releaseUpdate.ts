import type { Business, Row } from '../../src/business';

export function applyRelease08(b: Business, patch: Row): string[] {
  if (b.setting('release08') === patch.release) return [];
  const warnings: string[] = [];
  b.transaction(() => {
    // 1.0.1: ya no se guarda una copia completa dentro de la base (se respalda por fuera)
    // y no se pisa la comisión que el usuario haya configurado.
    if (b.setting('cardFeeBps') === null) b.setSetting('cardFeeBps',406);
    for (const source of patch.sales as Row[]) {
      const key='source08:'+source.id;
      if(b.setting(key)) continue;
      const current=b.db.getFirstSync<Row>('SELECT * FROM sales WHERE id=?',source.id);
      if(current?.status==='cancelled') { b.setSetting(key,'cancelled-preserved'); continue; }
      const meta=b.setting('sale:'+source.id,{});
      if(current && !String(meta.source||'').startsWith('Excel')) {
        warnings.push(`${source.id}: venta local conservada; revisar conciliación.`); continue;
      }
      if(!current && b.sales().some(s=>s.folio===source.id)) {
        warnings.push(`${source.id}: folio local existente; no se duplicó.`); continue;
      }
      b.run('SAVEPOINT release_sale');
      try {
        const lines=b.all('SELECT * FROM sale_lines WHERE saleId=?',source.id);
        if(current && (lines.length!==source.lines.length || lines.some(l=>!source.lines.some((x:Row)=>x.id===l.id && x.productId===l.productId)))) throw new Error('renglones locales modificados');
        const imported=b.all('SELECT * FROM ledger WHERE ref=?',source.id).filter(p=>/^pay-\d+-(cash|card|transfer)$|^fee-\d+$/.test(p.id));
        const extra=b.all("SELECT * FROM ledger WHERE ref=? AND kind='sale'",source.id).filter(p=>!imported.some(x=>x.id===p.id));
        if(extra.length) throw new Error('cobros locales adicionales conservados');
        let customerId=current?.customerId;
        if(!current) {
          customerId=b.db.getFirstSync<Row>('SELECT id FROM customers WHERE name=? COLLATE NOCASE',source.customer)?.id || 'excel08-'+source.id;
          b.run('INSERT OR IGNORE INTO customers VALUES(?,?,?,?,?,?)',customerId,source.customer,'','Excel · Ventas','Cliente','');
          b.run('INSERT INTO sales VALUES(?,?,?,?,?,?,?,?)',source.id,source.created,customerId,null,'Excel',source.total,source.cost,'confirmed');
        }
        for(const line of source.lines as Row[]) {
          const old=lines.find(l=>l.id===line.id);
          const allocations=old?b.all('SELECT * FROM allocations WHERE lineId=?',old.id):[];
          if(allocations.length>1) throw new Error('asignaciones locales de inventario conservadas');
          const allocation=allocations[0];
          const lotId=allocation?.lotId || 'initial-'+line.productId;
          const lot=b.one('SELECT * FROM lots WHERE id=?',lotId);
          const delivered=allocation?allocation.qty-b.reservedForLotAllocation(allocation.id):0;
          const delta=line.delivered-delivered;
          const otherReserved=b.reservedForLot(lotId)-(allocation?b.reservedForLotAllocation(allocation.id):0);
          if(lot.qty-delta<otherReserved+(line.qty-line.delivered)) throw new Error('stock insuficiente; operación conservada');
          if(!old) b.run('INSERT INTO sale_lines VALUES(?,?,?,?,?)',line.id,source.id,line.productId,line.qty,line.name);
          else b.run('UPDATE sale_lines SET qty=?,name=? WHERE id=?',line.qty,line.name,line.id);
          const allocationId=allocation?.id || 'allocation-'+line.sourceRow;
          if(allocation) b.run('UPDATE allocations SET qty=?,cost=? WHERE id=?',line.qty,line.unitCost,allocationId);
          else b.run('INSERT INTO allocations VALUES(?,?,?,?,?)',allocationId,line.id,lotId,line.qty,line.unitCost);
          b.setSetting('reservation:'+allocationId,line.qty-line.delivered);
          if(delta) {
            b.run('UPDATE lots SET qty=qty-? WHERE id=?',delta,lotId);
            b.run('INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)','release08-'+line.id,source.created,lotId,-delta,'sale',source.id,'Entrega según Excel');
          }
          b.setSetting('line:'+line.id,{unitPrice:line.unitPrice,discount:line.discount,delivered:line.delivered,sourceRow:line.sourceRow});
        }
        for(const p of imported) b.run('DELETE FROM ledger WHERE id=?',p.id);
        for(const p of source.payments as Row[]) {
          b.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)',p.id,source.created,p.accountId,p.amount,'sale',source.id,'Cobro Excel',null);
          if(p.fee) b.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)','fee-'+p.id.split('-')[1],source.created,p.accountId,-p.fee,'expense',source.id,'Comisión tarjeta 4.06% · Mercado Libre',null);
        }
        b.run('UPDATE sales SET total=?,cost=?,created=? WHERE id=?',source.total,source.cost,source.created,source.id);
        b.setSetting('sale:'+source.id,{...meta,folio:source.id,dateOnly:source.created.slice(0,10),source:'Excel · Ventas',costEstimated:true});
        b.setSetting(key,true);
        b.run('RELEASE release_sale');
      } catch(e) {
        b.run('ROLLBACK TO release_sale'); b.run('RELEASE release_sale');
        warnings.push(`${source.id}: ${e instanceof Error?e.message:String(e)}.`);
      }
    }
    for(const [sku,cost] of Object.entries(patch.costs)) {
      const meta=b.setting('product:'+sku,{});
      b.setSetting('product:'+sku,{...meta,referenceCost:cost});
      const lot=b.db.getFirstSync<Row>('SELECT cost FROM lots WHERE id=?','initial-'+sku);
      if(lot && (lot.cost===patch.previousCosts?.[sku] || lot.cost===cost)) b.run('UPDATE lots SET cost=? WHERE id=?',cost,'initial-'+sku);
    }
    b.setSetting('source08Summary',patch.summary);
    b.setSetting('source08Warnings',warnings);
    if(!warnings.length) b.setSetting('release08',patch.release);
    b.audit('import.update',patch.release,'Ventas conciliadas; comisión 4.06% por cobro con tarjeta.');
  });
  return warnings;
}
