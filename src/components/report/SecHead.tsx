export default function SecHead({
  n,
  kicker,
  title,
}: {
  n: string;
  kicker: string;
  title: string;
}) {
  return (
    <header className="anap-sechd">
      <div className="anap-sechd-n">§ {n}</div>
      <div className="anap-sechd-t">
        <div className="anap-sechd-kicker">{kicker}</div>
        <h2 className="anap-sechd-title">{title}</h2>
      </div>
      <div className="anap-sechd-rule"></div>
    </header>
  );
}
