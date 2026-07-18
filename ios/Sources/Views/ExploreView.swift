import SwiftUI

struct ExploreView: View {
    enum Filter: String, CaseIterable {
        case all = "All"
        case live = "Live"
        case free = "Free"
        case premium = "Premium"
    }

    @State private var catalog: Loadable<Catalog> = .loading
    @State private var filter: Filter = .all

    var body: some View {
        LoadableView(state: catalog, retry: load) { catalog in
            List {
                ForEach(filtered(catalog), id: \.name) { category in
                    Section(category.name.isEmpty ? "Other" : category.name) {
                        ForEach(category.scenarios) { scenario in
                            NavigationLink(value: scenario) { ScenarioRow(scenario: scenario) }
                        }
                    }
                }
            }
            .refreshable { await load() }
        }
        .navigationTitle("Explore")
        .navigationDestination(for: Scenario.self) { ScenarioDetailView(scenario: $0) }
        .toolbar {
            Picker("Filter", selection: $filter) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.menu)
        }
        .task { await load() }
    }

    private func filtered(_ catalog: Catalog) -> [CatalogCategory] {
        var categories = catalog.categories
        // live scenarios can sit off-library; show them under their own heading
        if !catalog.live.isEmpty {
            categories.insert(CatalogCategory(name: "Live", scenarios: catalog.live), at: 0)
        }
        return categories.compactMap { category in
            let scenarios = category.scenarios.filter { scenario in
                switch filter {
                case .all: true
                case .live: scenario.isLiving
                case .free: !scenario.isPremium
                case .premium: scenario.isPremium
                }
            }
            return scenarios.isEmpty
                ? nil : CatalogCategory(name: category.name, scenarios: scenarios)
        }
    }
}
