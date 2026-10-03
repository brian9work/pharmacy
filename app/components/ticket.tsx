import { textosMetodo, textosTicket as t } from "@/app/components/contenido";
import { marca } from "@/config/marca";
import { puntoDeVenta } from "@/config/punto-de-venta";
import { dinero } from "@/lib/formato";
import type { Ticket as DatosTicket } from "@/lib/tipos";

/** Ticket de venta para impresora térmica. Los estilos están en globals.css (.ticket). */
export function Ticket({ ticket }: { ticket: DatosTicket }) {
  const { negocio } = ticket;
  const efectivo = ticket.pagos.find((p) => p.metodo === "efectivo" && p.recibido !== null);

  return (
    <article className="ticket" data-ancho={puntoDeVenta.anchoTicket} aria-label={t.etiqueta(ticket.folio)}>
      <header className="ticket-centro">
        <p className="ticket-titulo">{marca.nombre}</p>
        {negocio.razonSocial && <p>{negocio.razonSocial}</p>}
        {negocio.rfc && <p>{t.rfc(negocio.rfc)}</p>}
        {negocio.direccion && <p>{negocio.direccion}</p>}
        {negocio.telefono && <p>{t.telefono(negocio.telefono)}</p>}
      </header>

      {ticket.cancelada && <p className="ticket-centro ticket-titulo">{t.cancelada}</p>}

      <dl className="ticket-filas">
        <div>
          <dt>{t.folio}</dt>
          <dd>{ticket.folio}</dd>
        </div>
        <div>
          <dt>{t.fecha}</dt>
          <dd>
            {ticket.fecha} {ticket.hora}
          </dd>
        </div>
        {ticket.caja && (
          <div>
            <dt>{t.caja}</dt>
            <dd>{ticket.caja}</dd>
          </div>
        )}
        {ticket.cajero && (
          <div>
            <dt>{t.cajero}</dt>
            <dd>{ticket.cajero}</dd>
          </div>
        )}
      </dl>

      <table className="ticket-partidas">
        <thead>
          <tr>
            <th scope="col">{t.producto}</th>
            <th scope="col">{t.importe}</th>
          </tr>
        </thead>
        <tbody>
          {ticket.partidas.map((p, i) => (
            <tr key={i}>
              <td>
                {p.nombre}
                <span className="ticket-detalle">
                  {p.cantidad} × {dinero(p.precio)}
                </span>
              </td>
              <td>{dinero(p.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ticket-filas">
        <div>
          <dt>{t.subtotal}</dt>
          <dd>{dinero(ticket.subtotal)}</dd>
        </div>
        <div>
          <dt>{t.iva}</dt>
          <dd>{dinero(ticket.iva)}</dd>
        </div>
        <div className="ticket-total">
          <dt>{t.total}</dt>
          <dd>{dinero(ticket.total)}</dd>
        </div>
      </dl>

      <dl className="ticket-filas">
        {ticket.pagos.map((p, i) => (
          <div key={i}>
            <dt>{textosMetodo[p.metodo]}</dt>
            <dd>{dinero(p.recibido ?? p.monto)}</dd>
          </div>
        ))}
        {efectivo && ticket.cambio !== null && (
          <div>
            <dt>{t.cambio}</dt>
            <dd>{dinero(ticket.cambio)}</dd>
          </div>
        )}
        <div>
          <dt>{t.piezasEtiqueta}</dt>
          <dd>{ticket.piezas}</dd>
        </div>
      </dl>

      {(negocio.pie || puntoDeVenta.leyendaNoFiscal) && (
        <footer className="ticket-centro">
          {negocio.pie && <p>{negocio.pie}</p>}
          {puntoDeVenta.leyendaNoFiscal && <p className="ticket-chico">{puntoDeVenta.leyendaNoFiscal}</p>}
        </footer>
      )}
    </article>
  );
}

/** Quita los márgenes de la página al imprimir el ticket. */
export function EstiloImpresionTicket() {
  return <style>{"@media print { @page { margin: 0; } }"}</style>;
}
