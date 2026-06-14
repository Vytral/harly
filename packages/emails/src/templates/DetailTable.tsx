/**
 * DetailTable — shared key/value table used by InterviewScheduled, OfferExtended.
 */
import { detailLabel, detailsTable, detailValue } from "./styles";

type Row = { label: string; value: string };

type DetailTableProps = {
  rows: Row[];
};

export function DetailTable({ rows }: DetailTableProps) {
  return (
    <table style={detailsTable}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={detailLabel}>{row.label}</td>
            <td style={detailValue}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
