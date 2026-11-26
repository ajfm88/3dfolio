// 3dfolio: upstream main.jsx without the Vercel Analytics import and element.
import ReactDOM from "react-dom/client";
import { LocaleProvider } from "@douyinfe/semi-ui";
import App from "./App.jsx";
// 3dfolio: accounts and cloud storage, only when both variables are set (cloud/CloudRoot.jsx).
import CloudRoot from "./cloud/CloudRoot.jsx";
import en_US from "@douyinfe/semi-ui/lib/es/locale/source/en_US";
import "./index.css";
import "./i18n/i18n.js";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <LocaleProvider locale={en_US}>
    <CloudRoot>
      <App />
    </CloudRoot>
  </LocaleProvider>,
);
