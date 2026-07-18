import Foundation

enum AppConfig {
    /// The backend origin. Debug talks to `just api` on localhost; Release to prod.
    static var apiBaseURL: URL {
        #if DEBUG
        URL(string: "http://localhost:8000")!
        #else
        URL(string: "https://game-theory.byah.org")!
        #endif
    }
}
