interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

const Toggle = ({ checked, onChange, label }: ToggleProps) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-border'}`}
    >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
);

export default Toggle;
