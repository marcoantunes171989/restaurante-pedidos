import SwiftUI

@main
struct CentralOperacionalApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(nil) // segue o sistema (light/dark)
        }
    }
}
