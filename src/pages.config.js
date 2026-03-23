/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import { lazy } from 'react';
import __Layout from './Layout.jsx';

const Compare = lazy(() => import('./pages/Compare'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const Insiders = lazy(() => import('./pages/Insiders'));
const Memes = lazy(() => import('./pages/Memes'));
const News = lazy(() => import('./pages/News'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Screener = lazy(() => import('./pages/Screener'));
const Signals = lazy(() => import('./pages/Signals'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Terminal = lazy(() => import('./pages/Terminal'));


export const PAGES = {
    "Compare": Compare,
    "Heatmap": Heatmap,
    "Insiders": Insiders,
    "Memes": Memes,
    "News": News,
    "Portfolio": Portfolio,
    "Scanner": Scanner,
    "Screener": Screener,
    "Signals": Signals,
    "Stocks": Stocks,
    "Terminal": Terminal,
}

export const pagesConfig = {
    mainPage: "Terminal",
    Pages: PAGES,
    Layout: __Layout,
};
