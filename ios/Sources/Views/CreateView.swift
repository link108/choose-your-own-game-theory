import SwiftUI

/// M2 placeholder: the conversational scenario builder lands here (authoring sessions,
/// typed option cards, draft preview, undo, accept flow — see project-overview-ios-app.md §8).
struct CreateView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Create", systemImage: "plus.bubble")
        } description: {
            Text("Build your own scenario in conversation with the AI — coming soon. "
                + "For now, scenarios can be created on the web app.")
        }
        .navigationTitle("Create")
    }
}
