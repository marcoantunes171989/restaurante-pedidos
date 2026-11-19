# Tabela IBPT (tributos aproximados — Lei 12.741/2012)

Coloque aqui `<UF>.json` (ex.: `SP.json`), gerado a partir do CSV oficial do IBPT
("De Olho no Imposto", tabela da UF da loja) com `ferramentas/importar-ibpt.mjs`.
O projeto **não inclui alíquotas inventadas**: sem o arquivo, a nota sai sem o valor
aproximado dos tributos. A tabela do IBPT tem vigência (normalmente semestral):
atualize o arquivo quando vencer (`meta.vigenciaFim`).
