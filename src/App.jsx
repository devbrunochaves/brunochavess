import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import Nav from './components/Nav/Nav.jsx'
import Hero from './components/Hero/Hero.jsx'
import SecaoSobre from './components/Sobre/SecaoSobre.jsx'
import CssRadar from './pages/CssRadar/CssRadar.jsx'

function Home() {
  return (
    <div>
      <Nav />
      <Hero />
      <SecaoSobre />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/css" element={<CssRadar />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
