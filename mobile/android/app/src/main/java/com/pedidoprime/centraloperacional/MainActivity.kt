package com.pedidoprime.centraloperacional

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.pedidoprime.centraloperacional.navigation.RootScreen
import com.pedidoprime.centraloperacional.ui.theme.CentralOperacionalTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CentralOperacionalTheme {
                RootScreen()
            }
        }
    }
}
