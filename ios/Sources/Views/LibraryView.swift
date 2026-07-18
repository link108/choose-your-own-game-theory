import SwiftUI

struct LibraryView: View {
    @State private var playthroughs: Loadable<[PlaythroughListItem]> = .loading
    @State private var scenarios: [Scenario] = []

    var body: some View {
        LoadableView(state: playthroughs, retry: load) { items in
            List {
                let active = items.filter { $0.status == "active" }
                let finished = items.filter { $0.status != "active" }

                if !active.isEmpty {
                    Section("In progress") {
                        ForEach(active) { item in
                            NavigationLink(value: item) { row(item) }
                        }
                    }
                }
                if !scenarios.isEmpty {
                    Section("My scenarios") {
                        ForEach(scenarios) { scenario in
                            NavigationLink(value: scenario) { ScenarioRow(scenario: scenario) }
                        }
                    }
                }
                if !finished.isEmpty {
                    Section("Finished") {
                        ForEach(finished) { item in
                            NavigationLink(value: item) { row(item) }
                        }
                    }
                }
                if active.isEmpty && finished.isEmpty && scenarios.isEmpty {
                    ContentUnavailableView(
                        "Nothing here yet",
                        systemImage: "books.vertical",
                        description: Text("Scenarios you play or create will show up here."))
                }
            }
            .refreshable { await load() }
        }
        .navigationTitle("Library")
        .navigationDestination(for: PlaythroughListItem.self) { item in
            if item.status == "active" {
                PlayView(playthroughId: item.id)
            } else {
                ReviewView(playthroughId: item.id)
            }
        }
        .navigationDestination(for: Scenario.self) { ScenarioDetailView(scenario: $0) }
        .task { await load() }
    }

    private func row(_ item: PlaythroughListItem) -> some View {
        VStack(alignment: .leading) {
            Text(item.scenarioTitle).font(.headline)
            Text("\(item.roleName) · \(item.status) · turn \(item.turnCount)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func load() async {
        do {
            async let mine = APIClient.shared.myPlaythroughs()
            async let created = APIClient.shared.myScenarios()
            let (items, owned) = try await (mine, created)
            playthroughs = .loaded(items)
            scenarios = owned
        } catch {
            if case .loading = playthroughs { playthroughs = .failed(error) }
        }
    }
}
