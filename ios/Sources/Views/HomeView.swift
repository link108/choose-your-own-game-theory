import SwiftUI

struct HomeView: View {
    @State private var catalog: Loadable<Catalog> = .loading
    @State private var active: [PlaythroughListItem] = []

    var body: some View {
        LoadableView(state: catalog, retry: load) { catalog in
            List {
                if !active.isEmpty {
                    Section("Continue playing") {
                        ForEach(active.prefix(3)) { item in
                            NavigationLink(value: item) {
                                VStack(alignment: .leading) {
                                    Text(item.scenarioTitle).font(.headline)
                                    Text("\(item.roleName) · turn \(item.turnCount)")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                if !catalog.featured.isEmpty {
                    Section("Featured") {
                        ForEach(catalog.featured) { scenario in
                            NavigationLink(value: scenario) { ScenarioRow(scenario: scenario) }
                        }
                    }
                }
                if !catalog.live.isEmpty {
                    Section("Live scenarios") {
                        ForEach(catalog.live) { scenario in
                            NavigationLink(value: scenario) { ScenarioRow(scenario: scenario) }
                        }
                    }
                }
            }
            .refreshable { await load() }
        }
        .navigationTitle("Home")
        .navigationDestination(for: Scenario.self) { ScenarioDetailView(scenario: $0) }
        .navigationDestination(for: PlaythroughListItem.self) {
            PlayView(playthroughId: $0.id)
        }
        .task { await load() }
    }

    private func load() async {
        do {
            async let cat = APIClient.shared.catalog()
            async let mine = APIClient.shared.myPlaythroughs()
            let (loadedCatalog, playthroughs) = try await (cat, mine)
            catalog = .loaded(loadedCatalog)
            active = playthroughs.filter { $0.status == "active" }
        } catch {
            if case .loading = catalog { catalog = .failed(error) }
        }
    }
}
