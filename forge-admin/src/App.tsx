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
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}

export default App;
