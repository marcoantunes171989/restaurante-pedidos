const URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

function ingredientes(nome) {
  const n = nome.toLowerCase();
  const m = [
    // Pizzas
    ["margherita", ["Massa", "Molho de tomate", "Muçarela", "Tomate", "Manjericão", "Orégano"]],
    ["calabresa", ["Massa", "Molho de tomate", "Muçarela", "Calabresa", "Cebola", "Orégano"]],
    ["portuguesa", ["Massa", "Molho de tomate", "Muçarela", "Presunto", "Ovo", "Cebola", "Ervilha"]],
    ["quatro queijos", ["Massa", "Molho de tomate", "Muçarela", "Provolone", "Parmesão", "Gorgonzola"]],
    ["frango c/ catupiry", ["Massa", "Molho de tomate", "Muçarela", "Frango desfiado", "Catupiry"]],
    ["pepperoni", ["Massa", "Molho de tomate", "Muçarela", "Pepperoni", "Orégano"]],
    ["pizza vegetariana", ["Massa", "Molho de tomate", "Muçarela", "Abobrinha", "Pimentão", "Berinjela", "Tomate"]],
    ["pizza bacon", ["Massa", "Molho de tomate", "Muçarela", "Bacon", "Orégano"]],
    ["napolitana", ["Massa", "Molho de tomate", "Muçarela", "Tomate", "Parmesão", "Orégano"]],
    ["pizza chocolate", ["Massa", "Chocolate ao leite", "Granulado"]],
    ["banana c/ canela", ["Massa", "Banana", "Açúcar", "Canela", "Leite condensado"]],
    ["romeu e julieta", ["Massa", "Goiabada", "Queijo"]],
    ["borda recheada", ["Catupiry"]],
    // Hambúrgueres
    ["cheeseburger", ["Pão brioche", "Hambúrguer", "Queijo cheddar", "Molho da casa"]],
    ["x-salada", ["Pão brioche", "Hambúrguer", "Queijo", "Alface", "Tomate", "Molho"]],
    ["x-bacon", ["Pão brioche", "Hambúrguer", "Queijo", "Bacon", "Molho"]],
    ["x-tudo", ["Pão brioche", "Hambúrguer", "Queijo", "Bacon", "Ovo", "Alface", "Tomate", "Molho"]],
    ["smash duplo", ["Pão brioche", "Dois smash", "Queijo", "Molho"]],
    ["burger vegetariano", ["Pão", "Hambúrguer de grão-de-bico", "Alface", "Tomate", "Molho"]],
    ["combo cheese", ["Cheeseburger", "Batata frita", "Refrigerante"]],
    ["combo bacon", ["X-Bacon", "Batata frita", "Refrigerante"]],
    ["batata com cheddar", ["Batata", "Cheddar", "Bacon"]],
    ["batata frita", ["Batata", "Sal"]],
    ["onion rings", ["Anéis de cebola", "Empanado"]],
    ["nuggets", ["Frango empanado", "Molho"]],
    // Sushi
    ["edamame", ["Vagem de soja", "Sal grosso"]],
    ["guioza", ["Massa", "Carne suína", "Molho shoyu"]],
    ["sunomono", ["Pepino", "Vinagre", "Gergelim"]],
    ["niguiri", ["Arroz", "Salmão", "Wasabi"]],
    ["sashimi", ["Salmão fresco"]],
    ["hossomaki", ["Arroz", "Salmão", "Alga nori"]],
    ["uramaki", ["Arroz", "Salmão", "Cream cheese", "Cebolinha", "Gergelim"]],
    ["temaki filadélfia", ["Alga nori", "Arroz", "Salmão", "Cream cheese"]],
    ["temaki", ["Alga nori", "Arroz", "Salmão"]],
    ["hot philadelphia", ["Arroz", "Salmão", "Cream cheese", "Empanado"]],
    ["hot roll", ["Arroz", "Salmão", "Empanado"]],
    ["combinado", ["Niguiri", "Sashimi", "Makis"]],
    // Restaurante
    ["caldo verde", ["Batata", "Calabresa", "Couve"]],
    ["bolinho de bacalhau", ["Bacalhau", "Batata", "Empanado"]],
    ["prato feito", ["Arroz", "Feijão", "Bife", "Salada", "Fritas"]],
    ["feijoada", ["Feijão preto", "Carnes", "Arroz", "Couve", "Laranja"]],
    ["parmegiana", ["Filé empanado", "Molho de tomate", "Muçarela", "Arroz", "Fritas"]],
    ["strogonoff", ["Frango", "Creme", "Arroz", "Batata palha"]],
    ["picanha", ["Picanha", "Arroz", "Farofa", "Vinagrete"]],
    ["lasanha", ["Massa", "Molho bolonhesa", "Presunto", "Queijo"]],
    ["macarronada", ["Macarrão", "Molho sugo", "Parmesão"]],
    ["porção de fritas", ["Batata", "Sal"]],
    ["arroz e feijão", ["Arroz", "Feijão"]],
    ["pudim", ["Leite condensado", "Ovos", "Calda de caramelo"]],
    ["mousse", ["Maracujá", "Creme de leite", "Leite condensado"]],
  ];
  for (const [t, arr] of m) if (n.includes(t)) return arr;
  // Bebidas e sucos não têm ingredientes a remover
  return [];
}

(async () => {
  const prods = await (await fetch(`${URL}/rest/v1/tab_produtos?select=id,nome`, { headers: H })).json();
  let ok = 0, comIng = 0;
  for (const p of prods) {
    const ing = ingredientes(p.nome);
    if (ing.length) comIng++;
    const r = await fetch(`${URL}/rest/v1/tab_produtos?id=eq.${p.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ ingredientes: ing }),
    });
    if (r.ok) ok++;
  }
  console.log(`Atualizados ${ok}/${prods.length} produtos (${comIng} com ingredientes).`);
})();
