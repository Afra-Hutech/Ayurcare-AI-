import React from 'react';

const FormInput = ({ label, type = 'text', name, value, onChange, placeholder, required = false, className = '', readOnly = false }) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        className="input-field"
      />
    </div>
  );
};

export default FormInput;
