interface CalibrationReportProps {
    lines: string[];
}

const CalibrationReport = ({ lines }: CalibrationReportProps) => (
    <pre className="max-h-80 overflow-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
        {lines.length ? lines.join('\n') : 'No report yet. Calibrate to see the results here.'}
    </pre>
);

export default CalibrationReport;
