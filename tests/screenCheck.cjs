// Revisión automática de pantallas: textos sueltos fuera de <Text> (en Android
// eso cierra la app: "Text strings must be rendered within a <Text>"), valores
// rotos en pantalla (NaN, undefined, [object Object], Infinity) y avisos de React.
const errors = [];
const origError = console.error;
console.error = (...a) => {
  const msg = a.map(String).join(" ");
  if (/react-test-renderer is deprecated|not wrapped in act|ExperimentalWarning/.test(msg)) return;
  errors.push(msg.slice(0, 300));
  return origError.apply(console, a);
};
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(" "));
const HOST_TEXT = new Set(["Text", "TextInput"]);
function screenIssues(ui, where) {
  const issues = [];
  for (const n of ui.root.findAll((x) => typeof x.type === "string" && !HOST_TEXT.has(x.type))) {
    for (const c of n.children || []) if (typeof c === "string" || typeof c === "number") issues.push(`${where}: texto suelto dentro de <${n.type}>: ${JSON.stringify(String(c).slice(0, 60))}`);
  }
  const t = text(ui.root);
  for (const bad of ["NaN", "undefined", "[object Object]", "Infinity", "$-", "null ·", "· null"]) {
    const re = new RegExp(`(^|[^A-Za-z])${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z])`);
    const m = re.exec(t);
    if (m) issues.push(`${where}: muestra "${bad}" → …${t.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, " ")}…`);
  }
  while (errors.length) issues.push(`${where}: console.error → ${errors.shift()}`);
  return issues;
}
module.exports = { screenIssues, text };
