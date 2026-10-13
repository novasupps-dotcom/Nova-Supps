import React from "react";
import { renderCustomersPages } from "./CustomersPages";
import { renderInventoryPages } from "./InventoryPages";
import type { Body, OwnerPageContext } from "./ownerContext";
import { renderParameters } from "./Parameters";
import { PaymentsPage } from "./Payments";
import { renderPaymentSettings } from "./PaymentSettings";
import { renderSalesPages } from "./SalesPages";
import { renderTeamPage } from "./TeamPage";

export function renderOwnerPage(ctx: OwnerPageContext): Body {
  if (ctx.page === "Cobros")
    return {
      scroll: (
        <PaymentsPage
          b={ctx.b!}
          revision={ctx.revision}
          onSale={(id) => {
            ctx.setSaleDetailId(id);
            ctx.go("Detalle venta");
          }}
        />
      ),
    };
  return (
    renderSalesPages(ctx) ??
    renderInventoryPages(ctx) ??
    renderCustomersPages(ctx) ??
    renderTeamPage(ctx) ??
    renderPaymentSettings(ctx) ??
    renderParameters(ctx) ?? { scroll: null }
  );
}
