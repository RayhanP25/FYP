import type { CalibrationCheck } from '@/api/calibrationApi';

interface CoverageChecksProps {
    checks: CalibrationCheck[];
}

const CoverageChecks = ({ checks }: CoverageChecksProps) => (
    <ul className="flex flex-col gap-2.5">
        {checks.map((check) => (
            <li key={check.text} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${check.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                <span className={check.ok ? 'text-text' : 'text-text-secondary'}>{check.text}</span>
            </li>
        ))}
    </ul>
);

export default CoverageChecks;
