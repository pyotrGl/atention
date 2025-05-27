import React from "react";
import "./CamsRow.css";

function CamsRow({ id, name, isSelected, onClick }) {
	return (
		<div
			className={`CamsRow ${isSelected ? "selected" : ""}`}
			onClick={onClick}
		>
			<label className="name">{name}</label>
		</div>
	);
}

export default CamsRow;
