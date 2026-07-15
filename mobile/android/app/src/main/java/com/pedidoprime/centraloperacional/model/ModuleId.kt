package com.pedidoprime.centraloperacional.model

/**
 * Identificador estável de cada módulo operacional — mesma ideia do iOS:
 * uma única fonte de verdade usada tanto pelos cards da Central quanto
 * pelas abas da bottom navigation.
 */
enum class ModuleId(val rawValue: String) {
    CENTRAL("central"),
    PEDIDOS("pedidos"),
    COZINHA("cozinha"),
    BAR("bar"),
    CAIXA("caixa");

    companion object {
        val TABS = listOf(CENTRAL, PEDIDOS, COZINHA, BAR, CAIXA)
        val MODULE_CARDS = listOf(PEDIDOS, COZINHA, BAR, CAIXA)
    }
}
