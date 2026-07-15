import { Refine } from "@refinedev/core";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import routerProvider from "@refinedev/react-router-v6";

import { dataProvider } from "./providers/dataProvider";
import { Layout } from "./components/layout";
import { ProgramsList } from "./pages/programs/list";
import { ProgramCreate } from "./pages/programs/create";
import { MappingsSimulator } from "./pages/mappings/create";
import { EventDispatcher } from "./pages/events/create";
import { SetupPage } from "./pages/setup";
import { CorrectionsList } from "./pages/corrections/list";
import { CorrectionShow } from "./pages/corrections/show";
import { AccessRequestsList } from "./pages/access-requests/list";
import { AccessRequestShow } from "./pages/access-requests/show";
import { ConsumerLedgerList } from "./pages/consumer-ledger/list";
import { ConsumerLedgerShow } from "./pages/consumer-ledger/show";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider}
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
    </BrowserRouter>
  );
}

export default App;
