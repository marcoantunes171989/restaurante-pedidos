const URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

// IDs de fotos Unsplash verificadas (HTTP 200)
const P = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=640&q=72`;
const IMG = {
  pizza: P("1513104890138-7c749659a591"),
  sushi: P("1579871494447-9811cf80d66c"),
  sashimi: P("1607301405390-d831c242f59b"),
  roll: P("1617196034796-73dfa7b1fd56"),
  burger: P("1568901346375-23c9450c58cd"),
  fries: P("1573080496219-bb080dd4f877"),
  feijoada: P("1604908176997-125f25cc6f3d"),
  steak: P("1546964124-0cce460f38ef"),
  pasta: P("1551183053-bf91a1d81141"),
  soup: P("1547592180-85f173990554"),
  drink: P("1581636625402-29b2a704ef13"),
  juice: P("1600271886742-f049cd451bba"),
  dessert: P("1488477181946-6428a0291777"),
  milkshake: P("1572490122747-3968b75cc699"),
  salad: P("1512621776951-a57141f2eefd"),
  nuggets: P("1562967914-608f82629710"),
  edamame: P("1611143669185-af224c5e3252"),
  gyoza: P("1496116218417-1a781b1c416c"),
};

function img(n, c) {
  n = n.toLowerCase(); c = (c || "").toLowerCase();
  const has = (s) => n.includes(s);
  if (has("pizza") || has("borda")) return IMG.pizza;
  if (has("sashimi")) return IMG.sashimi;
  if (has("niguiri")) return IMG.sushi;
  if (has("temaki") || has("uramaki") || has("hossomaki") || has("hot ") || has("philadelphia")) return IMG.roll;
  if (has("combinado")) return IMG.sushi;
  if (has("edamame")) return IMG.edamame;
  if (has("guioza")) return IMG.gyoza;
  if (has("sunomono")) return IMG.salad;
  if (has("cheeseburger") || has("x-") || has("smash") || has("burger") || has("combo")) return IMG.burger;
  if (has("batata") || has("fritas") || has("onion")) return IMG.fries;
  if (has("nuggets") || has("bacalhau")) return IMG.nuggets;
  if (has("milkshake")) return IMG.milkshake;
  if (has("refrigerante") || has("chá") || has("cha ")) return IMG.drink;
  if (has("suco")) return IMG.juice;
  if (has("feijoada") || has("prato feito") || has("arroz")) return IMG.feijoada;
  if (has("parmegiana") || has("picanha")) return IMG.steak;
  if (has("strogonoff")) return IMG.steak;
  if (has("lasanha") || has("macarron")) return IMG.pasta;
  if (has("pudim") || has("mousse")) return IMG.dessert;
  if (has("caldo")) return IMG.soup;
  if (c.includes("bebida")) return IMG.drink;
  if (c.includes("sobremesa")) return IMG.dessert;
  if (c.includes("entrada")) return IMG.salad;
  if (c.includes("pizza")) return IMG.pizza;
  if (c.includes("hambur")) return IMG.burger;
  if (c.includes("maki") || c.includes("sashimi") || c.includes("temaki") || c.includes("hot")) return IMG.sushi;
  return IMG.steak;
}

(async () => {
  const prods = await (await fetch(`${URL}/rest/v1/tab_produtos?select=id,nome,categoria`, { headers: H })).json();
  let ok = 0;
  for (const p of prods) {
    const r = await fetch(`${URL}/rest/v1/tab_produtos?id=eq.${p.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ url_imagem: img(p.nome, p.categoria) }),
    });
    if (r.ok) ok++;
  }
  console.log(`Atualizados ${ok}/${prods.length} produtos com imagens Unsplash.`);
})();
