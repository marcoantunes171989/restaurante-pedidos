# 175 — teste de concorrência da numeração fiscal

Executado em 15/11/2026 num laboratório local descartável (PostgreSQL 18, porta
55499, base mínima + migration 175). Nada em HML/PROD.

## Como reproduzir

1. Criar loja, usuário caixa (`ids_acesso = {cashier}`) e série NFC-e
   homologação começando em 1.
2. Disparar **40 conexões em paralelo**, cada uma como `authenticated` com o
   e-mail do caixa, chamando
   `app_fiscal_reservar_documento(loja, 65, 'homologacao', gen_random_uuid())`.
3. Ao mesmo tempo, disparar **10 conexões** com a **mesma** chave de
   idempotência (simula cliques repetidos na mesma venda).
4. Conferir:

```sql
select count(*) docs, count(distinct numero) numeros_distintos, min(numero), max(numero)
  from loja_fiscal_documento where loja_id = :loja;
```

## Resultado

| Conferência | Esperado | Obtido |
|---|---|---|
| Documentos criados | 41 (40 + 1 da venda repetida) | 41 |
| Números distintos | 41 | 41 |
| Faixa | 1 a 41, sem buraco | 1 a 41 |
| Próximo número da série | 42 | 42 |
| Documentos da venda repetida (10 cliques) | 1 | 1 |
