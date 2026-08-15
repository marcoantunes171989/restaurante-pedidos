export function filtrarPorLojaEstrita(registros = [], lojaId) {
  if (lojaId == null || lojaId === "") return [];
  const alvo = Number(lojaId);
  if (!Number.isFinite(alvo)) return [];
  return registros.filter((registro) => registro?.lojaId != null && Number(registro.lojaId) === alvo);
}

