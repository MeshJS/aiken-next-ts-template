import Head from "next/head";

import {
  resolvePlutusScriptAddress,
  Transaction,
  resolvePaymentKeyHash,
  KoiosProvider,
  resolveDataHash,
} from "@meshsdk/core";
import type { PlutusScript } from "@meshsdk/core";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";

import plutusScript from "@data/plutus.json";
import { useState } from "react";

enum States {
  init,
  locking,
  lockingConfirming,
  locked,
  unlocking,
  unlockingConfirming,
  unlocked,
}

export default function Home() {
  const [state, setState] = useState(States.init);

  const { connected } = useWallet();

  const script: PlutusScript = {
    code: plutusScript.validators[0].compiledCode,
    version: "V2",
  };

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
                  <Lock script={script} setState={setState} />
                )}
                <Unlock script={script} setState={setState} />
              </>
            )}

          {connected && (
            <>
              {(state == States.locking || state == States.unlocking) && (
                <>Creating transaction...</>
              )}
              {(state == States.lockingConfirming ||
                state == States.unlockingConfirming) && (
                <>Awaiting transaction confirm...</>
              )}
            </>
          )}
        </div>

        <div className="grid">
          <a href="https://meshjs.dev/apis" className="card">
            <h2>Documentation</h2>
            <p>
              Our documentation provide live demos and code samples; great
              educational tool for learning how Cardano works.
            </p>
          </a>

          <a
            href="https://meshjs.dev/guides/prove-wallet-ownership"
            className="card"
          >
            <h2>Smart Contracts</h2>
            <p>
              A step-by-step guide to integrate your Cardano Smart Contract to a
              web application.
            </p>
          </a>

          <a
            href="https://aiken-lang.org/getting-started/hello-world"
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

function Lock({ script, setState }) {
  const { wallet } = useWallet();

  async function lockAiken() {
    setState(States.locking);
    const scriptAddress = resolvePlutusScriptAddress(script, 0);

    const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);

    const tx = new Transaction({ initiator: wallet }).sendLovelace(
      {
        address: scriptAddress,
        datum: {
          value: hash,
        },
      },
      "20000000"
    );

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);
    console.log("txHash", txHash);
    if (txHash) {
      const koios = new KoiosProvider("preprod");
      setState(States.lockingConfirming);
      koios.onTxConfirmed(txHash, () => {
        setState(States.locked);
      });
    }
  }

  return (
    <button type="button" onClick={() => lockAiken()}>
      Lock Asset
    </button>
  );
}

function Unlock({ script, setState }) {
  const { wallet } = useWallet();

  async function _getAssetUtxo({ scriptAddress, asset, datum }) {
    const koios = new KoiosProvider("preprod");

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
    const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);

    const assetUtxo = await _getAssetUtxo({
      scriptAddress: scriptAddress,
      asset: "lovelace",
      datum: hash,
    });

    const address = await wallet.getChangeAddress();

    // create the unlock asset transaction
    const tx = new Transaction({ initiator: wallet })
      .redeemValue({
        value: assetUtxo,
        script: script,
        datum: hash,
      })
      .sendValue(address, assetUtxo)
      .setRequiredSigners([address]);

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("txHash", txHash);

    if (txHash) {
      const koios = new KoiosProvider("preprod");
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
