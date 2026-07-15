package com.pedidoprime.centraloperacional.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.R
import com.pedidoprime.centraloperacional.ui.theme.LocalPPColors
import com.pedidoprime.centraloperacional.ui.theme.PPFont

/** Tela mínima pós-logout — só o app real substituiria por um fluxo de login. */
@Composable
fun LoggedOutScreen(onBackToLogin: () -> Unit) {
    val colors = LocalPPColors.current
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(24.dp),
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = colors.success, modifier = Modifier.padding(top = 96.dp))
        Text(
            stringResource(R.string.sessao_encerrada),
            style = PPFont.sectionTitle,
            color = colors.text,
            modifier = Modifier.padding(top = 16.dp, bottom = 16.dp)
        )
        Button(onClick = onBackToLogin) {
            Text(stringResource(R.string.action_entrar_novamente))
        }
    }
}
