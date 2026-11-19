# Raiz ICP-Brasil v10 (autoridades confiáveis da SEFAZ)

Os serviços de autorização da SEFAZ-SP (nfe/nfce, homologação e produção) usam
certificado de servidor da cadeia ICP-Brasil (AC SOLUTI SSL EV G4 → AC Raiz
Brasileira v10), que o Node não traz no armazenamento padrão.

- Arquivo: `ICP-Brasilv10.crt` (PEM, 2.374 bytes) — "Autoridade Certificadora Raiz Brasileira v10"
- Baixado em 19/11/2026 de https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt (ITI)
- Conferido contra a cópia de https://repositorio.serpro.gov.br/docs/icpbrasilv10.crt (SERPRO): arquivos idênticos
- SHA-256: 6E:0B:FF:06:9A:26:99:4C:15:DE:2C:48:88:CC:54:AF:84:88:2E:54:95:B7:FB:F6:6B:E9:CC:FF:EC:74:89:F6
- Autoassinado, CA:TRUE, válido de 01/07/2019 a 01/07/2032
- Só a raiz é necessária: o servidor envia a intermediária.

`cadeiaIcp.js` confere esse SHA-256 ao carregar e recusa um arquivo diferente.
Para trocar a raiz (ex.: vencimento em 2032), baixe de fonte oficial, confira o
fingerprint e atualize `FINGERPRINT_SHA256` junto com o arquivo.
