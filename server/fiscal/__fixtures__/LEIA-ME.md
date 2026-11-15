# Certificado de TESTE (sem valor)

`certificado-teste.pfx` / `teste.crt` foram gerados localmente em 15/11/2026 com
OpenSSL, **autoassinados**, só para os testes automáticos da assinatura (Etapa E4).

- Titular fictício: `EMPRESA TESTE PEDIDO PRIME LTDA:12345678000195`
- Unidade: `SOMENTE TESTE SEM VALOR` — não é ICP-Brasil, a SEFAZ recusa.
- Senha do PFX (pública, só de teste): `teste-pedido-prime`
- Validade: até 12/11/2036.

Nunca coloque aqui certificado real de cliente. Certificados reais vão só para
o cofre (Supabase Vault, migration 176) pela API do servidor.
