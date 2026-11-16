// Bundles the Kubai Icons the dashboard uses (kubai-icons, MIT) into one script.
// Build with `npm run build:dashboard`; the output is committed as public/dashboard/vendor/kubai.js.
import {
  createIcon,
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  Sunrise, Sunset, Newspaper, ChartCandlestick, Wifi, Radio, Candle,
  Menu, Settings, Maximize, Stop, ShieldCheck, Route, Hotel, Tv, ShoppingCart, Waves, PhotoFrame, MoonStar,
} from 'kubai-icons'

const ICONS = Object.fromEntries([
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  Sunrise, Sunset, Newspaper, ChartCandlestick, Wifi, Radio, Candle,
  Menu, Settings, Maximize, Stop, ShieldCheck, Route, Hotel, Tv, ShoppingCart, Waves, PhotoFrame, MoonStar,
].map((icon) => [icon.name, icon]))

// kubai('cloud-sun', { size: 24, color: '#F59E0B' }) -> animated <svg>, or null for an unknown name.
window.kubai = (name, options) => (ICONS[name] ? createIcon(ICONS[name], options) : null)
window.kubai.names = Object.keys(ICONS)
