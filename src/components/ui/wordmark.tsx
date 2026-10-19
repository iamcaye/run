/** "RACE/TRAINING" logotype; size it with a text-* class. */
export function Wordmark({ className = "" }: { className?: string }) {
    return (
        <span className={`font-condensed font-extrabold italic uppercase tracking-wide ${className}`}>
            Run<span className="text-accent">.</span><span className="lowercase text-sm">caye.tv</span>
        </span>
    );
}
