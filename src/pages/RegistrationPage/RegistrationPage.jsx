import React, {useState} from "react";
import config from "../../config";
import Cookies from 'js-cookie';
import {Navigate, useNavigate, useParams} from 'react-router-dom';
import "./RegistrationPage.css";
import ErrorMessage from "../components/ErrorMessage";

function RegistrationPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [repeatPassword, setRepeatPassword] = useState('');
	const params = useParams();

	if (params.status === 200){
		return (<Navigate to="/main" replace/>)
	}

	function registration() {
		if (password === repeatPassword) {
			fetch(`${config.apiBaseURL}/${config.registration}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: email,
					password: password,
				}),
			})
				.then((res) => {
					if (res.status === 200) {
						Cookies.set("email", email);
						Cookies.set("password", password);
						navigate("/main");
					} else {
						navigate("/registration/403");;
					}
				})
				.catch((error) => {
					navigate("/registration/403");
				});
		} else {
			navigate("/registration/403");
		}
	}

	return (
		<div className="RegistrationPage">
			<div className="RegistrationPanel">
				<h1 className="RegistrationTitle">Регистрация</h1>
				<p className="RegistrationLabel">Введите Email</p>
				<input
					className="RegistrationInput"
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<p className="RegistrationLabel">Придумайте пароль</p>
				<input
					className="RegistrationInput"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<p className="RegistrationLabel">Подтвердите пароль</p>
				<input
					className="RegistrationInput"
					type="password"
					value={repeatPassword}
					onChange={(e) => setRepeatPassword(e.target.value)}
				/>

				{(password !== repeatPassword && password.length >= 8) &&
					<p className="RegistrationLabel Warning">Пароли не совпадают</p>}
				{(password.length < 8) &&
					<p className="RegistrationLabel Warning">Пароль должен состоять минимум из 8 символов</p>}

				<button
					className="RegistrationButton"
					onClick={registration}
				>
					Зарегистрироваться
				</button>
			</div>
			{params.status === "200" && <Navigate to="/main" replace/>}
			{params.status === "403" && <ErrorMessage link="/registration" statusText="Вы ещё не зарегистрированны, пожалуйста пройдите регистрацию"/>}
		</div>
	);
}

export default RegistrationPage;
