// Código IBGE da UF (cUF) de todas as 27 UFs, a partir da mesma tabela do cadastro do emitente
// (fonte única). Antes cada serviço tinha uma cópia só com SP, o que impedia emitir em outras UFs.
import { UFS, codigoUf } from "../../../src/lib/emitenteFiscalService.js";

export const COD_UF = Object.freeze(Object.fromEntries(UFS.map((uf) => [uf, codigoUf(uf)])));
