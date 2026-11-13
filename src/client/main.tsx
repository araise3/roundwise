// Browser entry: hydrate the server-rendered page from the props the Worker embedded.
import { hydrateRoot } from "react-dom/client";
import { App, type Payload } from "@/app";

const root = document.getElementById("root");
const data = document.getElementById("__data");
if (root && data?.textContent) {
  hydrateRoot(root, <App {...(JSON.parse(data.textContent) as Payload)} />);
}
