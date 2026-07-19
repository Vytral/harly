/**
 * DetailTable — shared key/value panel used by InterviewScheduled,
 * InterviewRescheduled and OfferExtended. Rendered as a hairlined card
 * (kraft surface, soft inner dividers) with muted labels and ink values.
 */
import {
  detailLabel,
  detailRow,
  detailRowLast,
  detailsCard,
  detailsTable,
  detailValue,
} from "./styles";

type Row = { label: string; value: string };

type DetailTableProps = {
  rows: Row[];
};

export function DetailTable({ rows }: DetailTableProps) {
  return (
    <table style={detailsCard}>
      <tbody>
        <tr>
          <td style={{ padding: "0" }}>
            <table style={detailsTable}>
              <tbody>
                {rows.map((row, index) => {
                  const isLast = index === rows.length - 1;
                  return (
                    <tr key={row.label} style={isLast ? detailRowLast : detailRow}>
                      <td style={detailLabel}>{row.label}</td>
                      <td style={detailValue}>{row.value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
