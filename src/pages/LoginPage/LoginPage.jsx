import React, { useState } from "react";
import Cookies from "js-cookie";
import {Navigate, useNavigate, useParams} from "react-router-dom";
import config from "../../config";
import "./LoginPage.css";
import ErrorMessage from "../components/ErrorMessage";

function LoginPage() {

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const params = useParams();
	const navigate = useNavigate();

	if (Cookies.get("password") && Cookies.get("email")) {
		fetch(`${config.apiBaseURL}/${config.loginEndpoint}`,{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: Cookies.get("email"), password: Cookies.get("password"),
			}),
		}).then(function (res) {
			if (res.status === 200) {
				return (<Navigate to="/main" replace/>)
			}else if (res.status === 400) {
				return (<Navigate to="/login/403" replace/>)
			}
		});
	}

	function login() {
		fetch(`${config.apiBaseURL}/${config.loginEndpoint}`,{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: email, password: password,
			}),
		}).then(response => {
			if (response.ok) {
				Cookies.set("password", password);
				Cookies.set("email", email);
				console.log(response.json());
				navigate("/main");
			}
		}).catch(error => {
			console.log(error);
			navigate("/login/403");
		});
	}

	return (
		<div className="LoginPage">
			<div className="LoginPanel">
				<h1 className="LoginTitle">Вход</h1>
				<p className="LoginLabel">Введите Email</p>
				<input
					className="LoginInput"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<p className="LoginLabel">Введите пароль</p>
				<input
					className="LoginInput"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button className="LoginButton" onClick={login}>
					Войти
				</button>
			</div>
			{params.status === "200" && <Navigate to="/login" replace/>}
			{params.status === "401" && <ErrorMessage link="/login" statusText="Войдите в аккаунт"/>}
			{params.status === "403" && <ErrorMessage link="/login" statusText="Неверный логин или пароль"/>}
		</div>
	);
}

export default LoginPage;
