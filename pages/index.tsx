import Head from "next/head";

import {
  resolvePlutusScriptAddress,
  Transaction,
  KoiosProvider,
  resolveDataHash,
  resolvePaymentKeyHash,
} from "@meshsdk/core";
import type { PlutusScript, Data } from "@meshsdk/core";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";

import plutusScript from "@data/plutus.json";
import { useState } from "react";
import cbor from "cbor";

enum States {
  init,
  locking,
  lockingConfirming,
  locked,
  unlocking,
  unlockingConfirming,
  unlocked,
}

const script: PlutusScript = {
  code: cbor
    .encode(Buffer.from(plutusScript.validators[0].compiledCode, "hex"))
    .toString("hex"),
  version: "V2",
};
const scriptAddress = resolvePlutusScriptAddress(script, 0);
const redeemerData = "Hello, World!";
const lovelaceAmount = "3000000";

const koios = new KoiosProvider("preprod");

export default function Home() {
  const [state, setState] = useState(States.init);

  const { connected } = useWallet();

  return (
    <div className="container">
      <Head>
        <title>Mesh App on Cardano</title>
        <meta name="description" content="A Cardano dApp powered my Mesh" />
        <link rel="icon" href="https://meshjs.dev/favicon/favicon-32x32.png" />
        <link
          href="https://meshjs.dev/css/template.css"
          rel="stylesheet"
          key="mesh-demo"
        />
      </Head>

      <main className="main">
        <h1 className="title">
          <a href="https://meshjs.dev/">Mesh</a> Aiken Hello World
        </h1>

        <div className="demo">
          {!connected && <CardanoWallet />}

          {connected &&
            state != States.locking &&
            state != States.unlocking && (
              <>
                {(state == States.init || state != States.locked) && (
                  <Lock setState={setState} />
                )}
                <Unlock setState={setState} />
              </>
            )}
        </div>

        {connected && (
          <div className="demo">
            {(state == States.locking || state == States.unlocking) && (
              <>Creating transaction...</>
            )}
            {(state == States.lockingConfirming ||
              state == States.unlockingConfirming) && (
              <>Awaiting transaction confirm...</>
            )}
          </div>
        )}

        <div className="grid">
          <a href="https://meshjs.dev/apis" className="card">
            <h2>Documentation</h2>
            <p>
              Our documentation provide live demos and code samples; great
              educational tool for learning how Cardano works.
            </p>
          </a>

          <a
            href="https://meshjs.dev/guides/smart-contract-transactions"
            className="card"
          >
            <h2>Smart Contracts</h2>
            <p>
              A step-by-step guide to integrate your Cardano Smart Contract to a
              web application.
            </p>
          </a>

          <a
            href="https://aiken-lang.org/example--hello-world"
            className="card"
          >
            <h2>Aiken Hello World</h2>
            <p>
              Write smart contracts on Cardano with Aiken. The supporting
              tutorial for this start kit is available on the Aiken website.
            </p>
          </a>
        </div>
      </main>

      <footer className="footer">
        <MeshBadge dark={true} />
      </footer>
    </div>
  );
}

function Lock({ setState }) {
  const { wallet } = useWallet();

  async function lockAiken() {
    setState(States.locking);

    const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);
    const datum: Data = {
      alternative: 0,
      fields: [hash],
    };

    const tx = new Transaction({ initiator: wallet }).sendLovelace(
      {
        address: scriptAddress,
        datum: { value: datum },
      },
      lovelaceAmount
    );

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log("txHash", txHash);
    if (txHash) {
      setState(States.lockingConfirming);
      koios.onTxConfirmed(
        txHash,
        () => {
          setState(States.locked);
        },
        100
      );
    }
  }

  return (
    <button type="button" onClick={() => lockAiken()}>
      Lock Asset
    </button>
  );
}

function Unlock({ setState }) {
  const { wallet } = useWallet();

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const utxos = await koios.fetchAddressUTxOs(scriptAddress, asset);

    const dataHash = resolveDataHash(datum);

    let utxo = utxos.find((utxo: any) => {
      return utxo.output.dataHash == dataHash;
    });

    return utxo;
  }

  async function unlockAiken() {
    setState(States.unlocking);
    const scriptAddress = resolvePlutusScriptAddress(script, 0);

    const address = (await wallet.getUsedAddresses())[0];
    const hash = resolvePaymentKeyHash(address);
    const datum: Data = {
      alternative: 0,
      fields: [hash],
    };

    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddress,
      asset: "lovelace",
      datum: datum,
    });
    console.log("assetUtxo", assetUtxo);

    const redeemer = { data: { alternative: 0, fields: [redeemerData] } };

    // create the unlock asset transaction
    const tx = new Transaction({ initiator: wallet })
      .redeemValue({
        value: assetUtxo,
        script: script,
        datum: datum,
        redeemer: redeemer,
      })
      .sendValue(address, assetUtxo)
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("txHash", txHash);

    if (txHash) {
      setState(States.unlockingConfirming);
      koios.onTxConfirmed(txHash, () => {
        setState(States.unlocked);
      });
    }

    if (txHash) setState(States.unlocked);
  }

  return (
    <button type="button" onClick={() => unlockAiken()}>
      Unlock Asset
    </button>
  );
}
