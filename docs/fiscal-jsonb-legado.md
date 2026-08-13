# Relatório do JSONB fiscal legado — `tab_produtos.fiscal` (migration 079)

Base para uma **futura** migration de limpeza controlada. Nada é apagado agora:
a coluna `fiscal` (JSONB) continua existindo e é lida como **fallback** por
`resolverFiscalProduto()` (`src/lib/fiscalService.js`), na ordem
regra da loja → cadastros normalizados → JSONB → indefinido.

## Classificação das chaves

### ✅ Continuam no PRODUTO (inerentes à mercadoria) — permanecem na UI
| Chave | Observação |
|---|---|
| `sku` | Código interno do item |
| `gtin` / `codigoBarrasEan` | GTIN/EAN do item |
| `ncm` | (também via FK `ncm_id`) |
| `cest` | (também via FK `cest_id`) |
| `origem` | Origem da mercadoria |
| `unidadeComercial`, `unidadeTributavel` | Unidades do item |
| `descricaoDanfe`, `informacaoComplementar` | Texto do item no documento |
| `observacoesFiscais`, `observacoesInternas` | Notas do item |

### ⚠️ Tributação — pertence à REGRA FISCAL (ficou como legado/exceção na UI, em `<details>`)
| Chave | Fonte preferida |
|---|---|
| `cstIcms`, `aliquotaIcms` | `loja_fiscal_regra` / cadastro ICMS |
| `cstPis`, `aliquotaPis` | regra / cadastro PIS |
| `cstCofins`, `aliquotaCofins` | regra / cadastro COFINS |
| `cstIpi`, `aliquotaIpi` | regra / cadastro IPI |
| `cBenef`, `cstIbsCbs`, `cClassTrib`, `cCredPres` | regra (Reforma Tributária) |
| `cfopInterno`, `cfopInterestadual` | **operação** — CFOP não é fixo do produto |

### 🏢 Pertencem à LOJA/EMITENTE — REMOVIDOS da UI do produto (dados preservados no JSONB)
| Chave | Agora em |
|---|---|
| `crt` | `loja_fiscal_emitente.crt` |
| `mensagemRodapeDanfe` | configuração geral de documento (loja) |

### 🧾 Pertencem à OPERAÇÃO/VENDA — REMOVIDOS da UI do produto (dados preservados no JSONB)
| Chave | Natureza |
|---|---|
| `indPres` | Indicador de presença (operação) |
| `indIntermed` | Intermediador (operação) |
| `indEntrega` | Entrega (operação) |
| `modalidadeFrete` | Frete (operação) |
| `indFinal` | Contribuinte final (operação) |
| `indIEDest` | Consumidor final (operação) |
| `destinoOperacao` | Destino (operação) |

## Próxima fase (não executar agora)
- Nenhuma migration destrutiva nesta fase. A eventual limpeza deve:
  1. mover `crt`/`mensagemRodapeDanfe` de produtos para a loja quando fizer sentido;
  2. mover indicadores de operação para a configuração de operação/venda;
  3. só então avaliar remover as chaves obsoletas do JSONB, com backup.
- `resolverFiscalProduto()` deve continuar preferindo regra/cadastros ao JSONB.
