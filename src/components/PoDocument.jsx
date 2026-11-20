import logo from '../assets/logo.png'
import { PO_CONTROL } from '../domain/constants.js'

export function PoDocument({ view }) {
  return (
    <article className="po-sheet">
      <header>
        <img src={logo} alt="Hydroferric Nigeria Limited" />
        <div>
          <p className="kicker">Controlled document</p>
          <h2>Purchase order</h2>
          <strong>{view.number}</strong>
        </div>
      </header>
      <dl className="meta">
        <div><dt>Issued</dt><dd>{view.issued}</dd></div>
        <div><dt>Supplier</dt><dd>{view.supplier}<br />{view.supplierAddress}</dd></div>
        <div><dt>Project</dt><dd>{view.project}<br />{view.site}</dd></div>
        <div><dt>Chain</dt><dd>{view.request}<br />{view.quotation}</dd></div>
      </dl>
      <table className="table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={`${line.description}-${line.qty}`}>
              <td>{line.description}</td>
              <td>{line.qty} {line.unit}</td>
              <td className="num">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="po-total">Total <strong>{view.total}</strong></p>
      <p><strong>Delivery. </strong>{view.deliveryTerms}</p>
      <p className="hint">{PO_CONTROL}</p>
      <p>Authorised by {view.approver} through the quotation approval on this chain.</p>
    </article>
  )
}
