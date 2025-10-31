import React from "react";
import "./ErrorMessage.css"

function ErrorMessage(props) {
	return (
		<>
			<div className="ErrorBackground"/>
			<div className="ErrorMessage">
				<p className="ErrorText">{props.statusText}</p>
				<a className="CloseButton" href={props.link} target="_self" rel="noopener">
					Ок
				</a>
			</div>
		</>
	);
}

export default ErrorMessage;