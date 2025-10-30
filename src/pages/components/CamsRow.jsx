import React from "react";
import "./CamsRow.css";

function CamsRow({ id, name, isSelected, onClick, onDelete }) {
    return (
        <div
            className={`CamsRow ${isSelected ? "selected" : ""}`}
            onClick={onClick}
        >
            <label className="name">{name}</label>
            <button
                className="delete-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(id);
                }}
            >
                ✕
            </button>
        </div>
    );
}

export default CamsRow;
