// 法律条款页：隐私政策（/privacy）+ 用户协议（/terms）。公开路由，无需登录。
// 内容为平台实际数据处理实践的如实描述；上线前请由法务复核定稿。
import { Link } from "react-router-dom";
import Reveal from "../components/Reveal";

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 16, marginTop: 22, marginBottom: 8 }}>{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: 13, lineHeight: 1.9, color: "var(--text-2, #444)", margin: "6px 0" }}>{children}</p>
);
const LI = ({ children }: { children: React.ReactNode }) => (
  <li style={{ fontSize: 13, lineHeight: 1.9, color: "var(--text-2, #444)" }}>{children}</li>
);

function Privacy() {
  return (
    <section style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 48px" }}>
      <Reveal>
      <div className="card">
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>隐私政策</h1>
        <div className="muted" style={{ fontSize: 12 }}>生效日期：2026-09-01 · 最近更新：2026-09-01</div>

        <H>一、我们收集的信息</H>
        <P>为提供公考备考服务，我们仅收集教学必需的最小化信息：</P>
        <ul>
          <LI>账号信息：邮箱（用于登录与账号安全）、昵称、密码（仅以 bcrypt 哈希存储，绝不明文）。</LI>
          <LI>报考画像（选填）：报考省份、目标考试、备考倒计时——用于生成学习计划与个性化诊断。</LI>
          <LI>学习数据：答题记录、收藏、错题、测评结果、模考成绩、AI 私教对话、申论作答——用于能力画像与复习推荐。</LI>
          <LI>订单信息：会员购买与退费记录（金额、订单号、支付方式），用于履约与财务合规。</LI>
        </ul>
        <P>我们不收集身份证号、人脸、通讯录、精确位置等敏感个人信息；不向第三方共享您的个人信息（法律法规要求除外）。</P>

        <H>二、信息的使用</H>
        <P>上述信息仅用于：账号安全与登录验证、提供题目练习与测评功能、生成学习计划与能力画像、会员权益履约、发送与服务相关的通知（如测评完成、会员到期提醒）。我们不会将您的个人信息用于广告营销。</P>

        <H>三、信息的存储</H>
        <P>您的数据存储于平台自有服务器，通过 HTTPS 加密传输。密码重置令牌设置有效期并单次有效。会员订单与退费记录依《税收征管法》《会计档案管理办法》要求留存。</P>

        <H>四、您的权利</H>
        <P>依据《个人信息保护法》，您享有以下权利，均可在「我的 → 账号与数据」中直接行使：</P>
        <ul>
          <LI><b>查阅与复制</b>：点击「导出我的数据」，系统将生成包含您全部个人信息的 JSON 文件供下载。</LI>
          <LI><b>更正</b>：在「我的」页面随时修改昵称、报考省份、目标考试等画像信息。</LI>
          <LI><b>删除 / 注销</b>：点击「注销账号」并输入密码确认，平台将立即删除您的答题、聊天、收藏、测评等全部个人数据，并对账号匿名化处理。订单财务记录依法规留存，但已与您的身份信息脱钩。</LI>
          <LI><b>撤回同意</b>：注销账号即视为撤回全部处理同意。</LI>
        </ul>

        <H>五、未成年人保护</H>
        <P>本平台面向公考考生，不面向未满 14 周岁的未成年人提供服务。</P>

        <H>六、政策更新与联系我们</H>
        <P>政策发生实质性变更时，我们将通过站内通知告知您。如对本政策有任何疑问、建议或投诉，可通过客服邮箱联系我们，我们将在 15 个工作日内回复。</P>
      </div>
      </Reveal>
    </section>
  );
}

function Terms() {
  return (
    <section style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 48px" }}>
      <Reveal>
      <div className="card">
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>用户服务协议</h1>
        <div className="muted" style={{ fontSize: 12 }}>生效日期：2026-09-01 · 最近更新：2026-09-01</div>

        <H>一、协议范围</H>
        <P>本协议是您与平台之间关于使用公考 AI 私教服务（题目练习、智能测评、AI 私教问答、申论批改、模考、会员服务）的约定。注册账号即表示您已阅读并同意本协议与《隐私政策》。</P>

        <H>二、账号与安全</H>
        <ul>
          <LI>您应妥善保管账号密码，并对账号下发生的行为负责。</LI>
          <LI>请勿将账号转让、出租给他人使用；由此产生的风险由您自行承担。</LI>
          <LI>发现账号被盗用时请立即通过「忘记密码」重置或联系客服。</LI>
        </ul>

        <H>三、会员服务与退费</H>
        <ul>
          <LI>会员权益以购买页面展示为准（AI 讲解不限量、完整模考报告等）。</LI>
          <LI>虚拟商品按平台规则支持未使用情形下的退费；退费申请提交后 3 个工作日内处理到账，可在「会员」页发起。</LI>
          <LI>会员到期后相关权益停止，您产生的学习数据仍可正常查看。</LI>
        </ul>

        <H>四、内容与使用规范</H>
        <ul>
          <LI>平台题目、解析、知识点图谱等内容仅供个人备考学习使用，未经授权不得批量抓取、转载或商用。</LI>
          <LI>AI 私教生成的内容基于算法生成，可能存在偏差，请以官方教材与考试大纲为最终依据；申论批改支持转人工复核。</LI>
          <LI>禁止利用平台从事任何违法违规活动，或对平台进行恶意攻击、爬取、刷量。</LI>
        </ul>

        <H>五、免责声明</H>
        <P>因不可抗力、网络故障、系统维护导致的服务中断，我们将尽力缩短影响时间，但不承担由此造成的间接损失。您因违反本协议导致的账号封禁，平台不予退还未消耗会员费用。</P>

        <H>六、协议的变更与终止</H>
        <ul>
          <LI>协议实质性变更将通过站内通知告知；继续使用即视为接受变更。</LI>
          <LI>您可随时停止使用并注销账号（见《隐私政策》第四节）；注销后本协议终止。</LI>
        </ul>

        <p style={{ fontSize: 13, lineHeight: 1.9, margin: "18px 0 6px" }}>
          相关文档：<Link to="/privacy">《隐私政策》</Link> · <Link to="/">返回首页</Link>
        </p>
      </div>
      </Reveal>
    </section>
  );
}

export default function Legal({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <>
      {kind === "privacy" ? <Privacy /> : <Terms />}
      {kind === "privacy" && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 40px", textAlign: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            相关文档：<Link to="/terms">《用户服务协议》</Link> · <Link to="/">返回首页</Link>
          </span>
        </div>
      )}
    </>
  );
}
