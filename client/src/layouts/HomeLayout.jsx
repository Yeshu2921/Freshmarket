
import { Outlet } from "react-router-dom";

import HomeHeader from "../components/HomeHeader";
import HomeFooter from "../components/HomeFooter";

import "./HomeLayout.css";

export default function HomeLayout() {
  return (
    <div id="top" className="public-site">
      <HomeHeader />

      <main className="public-main">
        <Outlet />
      </main>

      <HomeFooter />
    </div>
  );
}
