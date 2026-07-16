import { Refine } from "@refinedev/core";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import routerProvider from "@refinedev/react-router-v6";

import { dataProvider } from "./providers/dataProvider";
import { demoDataProvider } from "./providers/demoDataProvider";
import { Layout } from "./components/layout";
import { ProgramsList } from "./pages/programs/list";
import { ProgramCreate } from "./pages/programs/create";
import { MappingsSimulator } from "./pages/mappings/create";
import { EventDispatcher } from "./pages/events/create";
import { SetupPage } from "./pages/setup";
import { DataPortabilityRegistry } from "./pages/data-portability";
import { CorrectionsList } from "./pages/corrections/list";
import { CorrectionShow } from "./pages/corrections/show";
import { AccessRequestsList } from "./pages/access-requests/list";
import { AccessRequestShow } from "./pages/access-requests/show";
import { ConsumerLedgerList } from "./pages/consumer-ledger/list";
import { ConsumerLedgerShow } from "./pages/consumer-ledger/show";
import "./index.css";

function App() {
  // Static demo build (VITE_DEMO=true) uses an in-memory data provider + hash
  // routing so it runs on GitHub Pages with no backend. The default dev/live
  // build is unchanged: BrowserRouter + the real backend-wired dataProvider.
  const isDemo = import.meta.env.VITE_DEMO === "true";
  const Router = isDemo ? HashRouter : BrowserRouter;
  const activeDataProvider = isDemo ? demoDataProvider : dataProvider;

  return (
    <Router>
      <Refine
        dataProvider={activeDataProvider}
        routerProvider={routerProvider}
        resources={[
          {
            name: "programs",
            list: "/programs",
            create: "/programs/create",
          },
          {
            name: "mappings",
            create: "/mappings",
          },
          {
            name: "events",
            create: "/events",
          },
          {
            name: "setup",
            create: "/setup",
          },
          {
            name: "data-portability",
            list: "/data-portability",
          },
          {
            name: "corrections",
            list: "/corrections",
            show: "/corrections/show/:id",
          },
          {
            name: "access-requests",
            list: "/access-requests",
            show: "/access-requests/show/:id",
          },
          {
            name: "consumer-ledger",
            list: "/consumer-ledger",
            show: "/consumer-ledger/show/:id",
          },
        ]}
      >
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ProgramsList />} />
            <Route path="/programs">
              <Route index element={<ProgramsList />} />
              <Route path="create" element={<ProgramCreate />} />
            </Route>
            <Route path="/mappings" element={<MappingsSimulator />} />
            <Route path="/events" element={<EventDispatcher />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/data-portability" element={<DataPortabilityRegistry />} />
            <Route path="/corrections">
              <Route index element={<CorrectionsList />} />
              <Route path="show/:id" element={<CorrectionShow />} />
            </Route>
            <Route path="/access-requests">
              <Route index element={<AccessRequestsList />} />
              <Route path="show/:id" element={<AccessRequestShow />} />
            </Route>
            <Route path="/consumer-ledger">
              <Route index element={<ConsumerLedgerList />} />
              <Route path="show/:id" element={<ConsumerLedgerShow />} />
            </Route>
          </Route>
        </Routes>
      </Refine>
    </Router>
  );
}

export default App;
