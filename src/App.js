import './App.css';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import RegistrationPage from "./pages/RegistrationPage/RegistrationPage";
import LoginPage from "./pages/LoginPage/LoginPage";
import MainPage from "./pages/MainPage/MainPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/registration" element={<RegistrationPage/>} />
          <Route path="/" element={<RegistrationPage/>} />
          <Route path="/registration/:status" element={<RegistrationPage/>} />
          <Route path="/login" element={<LoginPage/>} />
          <Route path="/login/:status" element={<LoginPage/>} />
          <Route path="/main" element={<MainPage/>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
