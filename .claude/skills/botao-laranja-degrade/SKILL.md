---
name: botao-laranja-degrade
description: Padrão OFICIAL dos botões laranja do projeto restaurante-pedidos — laranja sólido #F38525 com texto/ícone #012E46 e hover por opacidade. Todo botão de AÇÃO laranja (e o estado ativo de chips/toggles) usa a utility `.btn-laranja` (definida em src/index.css). Use SEMPRE que criar/alterar um botão laranja, um chip/segmented ativo, ou quando pedirem "botão laranja", "degradê", "cor do botão", "laranja claro/gourmet", "botão premium", "hover do botão", "ao selecionar". Trabalha com identidade-visual, padronizar-cores-pedido-prime e responsabilidade-qualidade.
---

# Botão laranja oficial (`.btn-laranja`)

Paleta vigente (`padronizar-cores-pedido-prime`):

- Fundo: `#F38525`
- Texto/ícone: `#012E46` (nunca branco sobre laranja)
- Hover/foco: opacidade da cor oficial (sem matiz nova / sem degradê colorido)

```css
.btn-laranja {
  background-image: none;
  background-color: #F38525;
  color: #012E46;
}
```

No **painel admin** (`.pp-admin-module`), a ação vira petróleo `#012E46` com
texto branco — ver skill `admin-acao-petroleo`.
