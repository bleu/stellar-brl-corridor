import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAA47ICIUOVQEHZFIUJFBJYCWF6WJBLIYRRN4AJVHT5O7LNZ2LN7R72S",
  }
} as const


/**
 * A pending queue entry. Existence in storage means pending: executed,
 * cancelled, and expired entries are removed, and the emitted events are the
 * history of record.
 */
export interface Entry {
  /**
 * Transfer amount in the asset's minor units; 0 for config changes.
 */
amount: i128;
  /**
 * First ledger timestamp (inclusive) at which `execute` is permitted.
 */
executable_at: u64;
  /**
 * Ledger timestamp (exclusive) from which the entry is void.
 */
expires_at: u64;
  kind: OpKind;
  /**
 * Opaque operation data for the executing smart account; this policy
 * contract never interprets it.
 */
payload: Buffer;
  user: string;
}

export const Errors = {
  1: {message:"InvalidConfig"},
  2: {message:"InvalidAmount"},
  3: {message:"EntryNotFound"},
  4: {message:"CooldownNotElapsed"},
  5: {message:"EntryExpired"},
  6: {message:"NotYetExpired"},
  7: {message:"Overflow"}
}


/**
 * Per-instance delay policy, fixed at construction.
 */
export interface Config {
  cooldown_secs: u64;
  expiration_secs: u64;
}

/**
 * What kind of operation is being delayed. The distinction is part of the
 * event interface: downstream Spendable treats a queued `ConfigChange` as a
 * full-balance withdrawal, while a `Transfer` reduces Spendable by `amount`.
 */
export type OpKind = {tag: "Transfer", values: void} | {tag: "ConfigChange", values: void};





export interface Client {
  /**
   * Construct and simulate a queue transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Queue an operation for delayed execution, authorized by `user`. The
   * entry becomes executable at `now + cooldown` and void at
   * `now + expiration`. Returns the entry id (sequential per instance).
   */
  queue: ({user, kind, amount, payload}: {user: string, kind: OpKind, amount: i128, payload: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a pending entry. Only the queuing user can authorize this —
   * there is intentionally no admin or third-party cancellation path.
   */
  cancel: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a expire transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reap an entry whose execution window has passed. Permissionless:
   * expiry is a fact of time, not a decision, so anyone may emit the
   * `entry_expired` event and free the storage.
   */
  expire: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Execute a pending entry, authorized by its queuing user. Valid only
   * inside `[executable_at, expires_at)`. Removes the entry and returns it
   * so the caller (the composing smart account) can act on the payload.
   */
  execute: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Entry>>>

  /**
   * Construct and simulate a get_entry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a pending entry. `None` once executed, cancelled, or reaped.
   */
  get_entry: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Entry>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The configured delay policy.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {cooldown_secs, expiration_secs}: {cooldown_secs: u64, expiration_secs: u64},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({cooldown_secs, expiration_secs}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAKJBIHBlbmRpbmcgcXVldWUgZW50cnkuIEV4aXN0ZW5jZSBpbiBzdG9yYWdlIG1lYW5zIHBlbmRpbmc6IGV4ZWN1dGVkLApjYW5jZWxsZWQsIGFuZCBleHBpcmVkIGVudHJpZXMgYXJlIHJlbW92ZWQsIGFuZCB0aGUgZW1pdHRlZCBldmVudHMgYXJlIHRoZQpoaXN0b3J5IG9mIHJlY29yZC4AAAAAAAAAAAAFRW50cnkAAAAAAAAGAAAAQVRyYW5zZmVyIGFtb3VudCBpbiB0aGUgYXNzZXQncyBtaW5vciB1bml0czsgMCBmb3IgY29uZmlnIGNoYW5nZXMuAAAAAAAABmFtb3VudAAAAAAACwAAAENGaXJzdCBsZWRnZXIgdGltZXN0YW1wIChpbmNsdXNpdmUpIGF0IHdoaWNoIGBleGVjdXRlYCBpcyBwZXJtaXR0ZWQuAAAAAA1leGVjdXRhYmxlX2F0AAAAAAAABgAAADpMZWRnZXIgdGltZXN0YW1wIChleGNsdXNpdmUpIGZyb20gd2hpY2ggdGhlIGVudHJ5IGlzIHZvaWQuAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAEa2luZAAAB9AAAAAGT3BLaW5kAAAAAABgT3BhcXVlIG9wZXJhdGlvbiBkYXRhIGZvciB0aGUgZXhlY3V0aW5nIHNtYXJ0IGFjY291bnQ7IHRoaXMgcG9saWN5CmNvbnRyYWN0IG5ldmVyIGludGVycHJldHMgaXQuAAAAB3BheWxvYWQAAAAADgAAAAAAAAAEdXNlcgAAABM=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAANSW52YWxpZENvbmZpZwAAAAAAAAEAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAACAAAAAAAAAA1FbnRyeU5vdEZvdW5kAAAAAAAAAwAAAAAAAAASQ29vbGRvd25Ob3RFbGFwc2VkAAAAAAAEAAAAAAAAAAxFbnRyeUV4cGlyZWQAAAAFAAAAAAAAAA1Ob3RZZXRFeHBpcmVkAAAAAAAABgAAAAAAAAAIT3ZlcmZsb3cAAAAH",
        "AAAAAQAAADFQZXItaW5zdGFuY2UgZGVsYXkgcG9saWN5LCBmaXhlZCBhdCBjb25zdHJ1Y3Rpb24uAAAAAAAAAAAAAAZDb25maWcAAAAAAAIAAAAAAAAADWNvb2xkb3duX3NlY3MAAAAAAAAGAAAAAAAAAA9leHBpcmF0aW9uX3NlY3MAAAAABg==",
        "AAAAAgAAANxXaGF0IGtpbmQgb2Ygb3BlcmF0aW9uIGlzIGJlaW5nIGRlbGF5ZWQuIFRoZSBkaXN0aW5jdGlvbiBpcyBwYXJ0IG9mIHRoZQpldmVudCBpbnRlcmZhY2U6IGRvd25zdHJlYW0gU3BlbmRhYmxlIHRyZWF0cyBhIHF1ZXVlZCBgQ29uZmlnQ2hhbmdlYCBhcyBhCmZ1bGwtYmFsYW5jZSB3aXRoZHJhd2FsLCB3aGlsZSBhIGBUcmFuc2ZlcmAgcmVkdWNlcyBTcGVuZGFibGUgYnkgYGFtb3VudGAuAAAAAAAAAAZPcEtpbmQAAAAAAAIAAAAAAAAAAAAAAAhUcmFuc2ZlcgAAAAAAAAAAAAAADENvbmZpZ0NoYW5nZQ==",
        "AAAAAAAAAMBRdWV1ZSBhbiBvcGVyYXRpb24gZm9yIGRlbGF5ZWQgZXhlY3V0aW9uLCBhdXRob3JpemVkIGJ5IGB1c2VyYC4gVGhlCmVudHJ5IGJlY29tZXMgZXhlY3V0YWJsZSBhdCBgbm93ICsgY29vbGRvd25gIGFuZCB2b2lkIGF0CmBub3cgKyBleHBpcmF0aW9uYC4gUmV0dXJucyB0aGUgZW50cnkgaWQgKHNlcXVlbnRpYWwgcGVyIGluc3RhbmNlKS4AAAAFcXVldWUAAAAAAAAEAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAEa2luZAAAB9AAAAAGT3BLaW5kAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAHcGF5bG9hZAAAAAAOAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAIZDYW5jZWwgYSBwZW5kaW5nIGVudHJ5LiBPbmx5IHRoZSBxdWV1aW5nIHVzZXIgY2FuIGF1dGhvcml6ZSB0aGlzIOKAlAp0aGVyZSBpcyBpbnRlbnRpb25hbGx5IG5vIGFkbWluIG9yIHRoaXJkLXBhcnR5IGNhbmNlbGxhdGlvbiBwYXRoLgAAAAAABmNhbmNlbAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAK1SZWFwIGFuIGVudHJ5IHdob3NlIGV4ZWN1dGlvbiB3aW5kb3cgaGFzIHBhc3NlZC4gUGVybWlzc2lvbmxlc3M6CmV4cGlyeSBpcyBhIGZhY3Qgb2YgdGltZSwgbm90IGEgZGVjaXNpb24sIHNvIGFueW9uZSBtYXkgZW1pdCB0aGUKYGVudHJ5X2V4cGlyZWRgIGV2ZW50IGFuZCBmcmVlIHRoZSBzdG9yYWdlLgAAAAAAAAZleHBpcmUAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAM5FeGVjdXRlIGEgcGVuZGluZyBlbnRyeSwgYXV0aG9yaXplZCBieSBpdHMgcXVldWluZyB1c2VyLiBWYWxpZCBvbmx5Cmluc2lkZSBgW2V4ZWN1dGFibGVfYXQsIGV4cGlyZXNfYXQpYC4gUmVtb3ZlcyB0aGUgZW50cnkgYW5kIHJldHVybnMgaXQKc28gdGhlIGNhbGxlciAodGhlIGNvbXBvc2luZyBzbWFydCBhY2NvdW50KSBjYW4gYWN0IG9uIHRoZSBwYXlsb2FkLgAAAAAAB2V4ZWN1dGUAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAFRW50cnkAAAAAAAAD",
        "AAAABQAAAK9FbWl0dGVkIHdoZW4gYSB1c2VyIHF1ZXVlcyBhbiBvcGVyYXRpb24uIFRvcGljczogYGVudHJ5X3F1ZXVlZGAsIGBpZGAsCmB1c2VyYC4gQ2FycmllcyBldmVyeXRoaW5nIHRoZSBpbmRleGVyIG5lZWRzIHRvIHN1YnRyYWN0IHRoZSBlbnRyeSBmcm9tClNwZW5kYWJsZSB3aXRob3V0IGFuIGV4dHJhIHJlYWQuAAAAAAAAAAALRW50cnlRdWV1ZWQAAAAAAQAAAAxlbnRyeV9xdWV1ZWQAAAAGAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAEa2luZAAAB9AAAAAGT3BLaW5kAAAAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAA1leGVjdXRhYmxlX2F0AAAAAAAABgAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAASNFbWl0dGVkIHdoZW4gYSBkZWFkIGVudHJ5IGlzIHJlYXBlZCBieSB0aGUgcGVybWlzc2lvbmxlc3MgYGV4cGlyZWAuClRvcGljczogYGVudHJ5X2V4cGlyZWRgLCBgaWRgLCBgdXNlcmAuIE5vdGUgdGhlIGVudHJ5IHdhcyBhbHJlYWR5IHZvaWQgZnJvbQpgZXhwaXJlc19hdGAgb24g4oCUIHRoaXMgZXZlbnQgbWFya3MgdGhlIHJlYXBpbmcsIG5vdCB0aGUgbW9tZW50IG9mIGV4cGlyeSwKYW5kIHRoZSBpbmRleGVyIG11c3Qgbm90IHJlbHkgb24gaXQgdG8gZHJvcCBlbnRyaWVzIGZyb20gdGhlIGxpdmUgdmlldy4AAAAAAAAAAAxFbnRyeUV4cGlyZWQAAAABAAAADWVudHJ5X2V4cGlyZWQAAAAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAEa2luZAAAB9AAAAAGT3BLaW5kAAAAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAEFSZWFkIGEgcGVuZGluZyBlbnRyeS4gYE5vbmVgIG9uY2UgZXhlY3V0ZWQsIGNhbmNlbGxlZCwgb3IgcmVhcGVkLgAAAAAAAAlnZXRfZW50cnkAAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPoAAAH0AAAAAVFbnRyeQAAAA==",
        "AAAABQAAAFxFbWl0dGVkIHdoZW4gYW4gZW50cnkgaXMgZXhlY3V0ZWQgaW5zaWRlIGl0cyB3aW5kb3cuIFRvcGljczoKYGVudHJ5X2V4ZWN1dGVkYCwgYGlkYCwgYHVzZXJgLgAAAAAAAAANRW50cnlFeGVjdXRlZAAAAAAAAAEAAAAOZW50cnlfZXhlY3V0ZWQAAAAAAAQAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAAAAAAAARraW5kAAAH0AAAAAZPcEtpbmQAAAAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAAAAAAABxUaGUgY29uZmlndXJlZCBkZWxheSBwb2xpY3kuAAAACmdldF9jb25maWcAAAAAAAAAAAABAAAH0AAAAAZDb25maWcAAA==",
        "AAAABQAAAF9FbWl0dGVkIHdoZW4gdGhlIHF1ZXVpbmcgdXNlciBjYW5jZWxzIHRoZWlyIG93biBlbnRyeS4gVG9waWNzOgpgZW50cnlfY2FuY2VsbGVkYCwgYGlkYCwgYHVzZXJgLgAAAAAAAAAADkVudHJ5Q2FuY2VsbGVkAAAAAAABAAAAD2VudHJ5X2NhbmNlbGxlZAAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAEa2luZAAAB9AAAAAGT3BLaW5kAAAAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAW9EZXBsb3kgd2l0aCB0aGUgZGVsYXkgcG9saWN5OiBhbiBlbnRyeSBxdWV1ZWQgYXQgYHRgIGlzIGV4ZWN1dGFibGUgaW4KYFt0ICsgY29vbGRvd25fc2VjcywgdCArIGV4cGlyYXRpb25fc2VjcylgLiBBRFItMDAwMSBkZWZhdWx0cyBhcmUKMTgwIC8gMTgwMCDigJQgcGFzc2VkIGJ5IHRoZSBkZXBsb3llciwgbm90IGJha2VkIGluLgpUcmFwcyB3aXRoIGBJbnZhbGlkQ29uZmlnYCB1bmxlc3MgYGV4cGlyYXRpb25fc2VjcyA+IGNvb2xkb3duX3NlY3NgIOKAlApvdGhlcndpc2UgdGhlIGV4ZWN1dGlvbiB3aW5kb3cgYFtjb29sZG93biwgZXhwaXJhdGlvbilgIGlzIGVtcHR5IGFuZApldmVyeSBlbnRyeSB3b3VsZCBiZSBkZWFkIG9uIGFycml2YWwuAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAANY29vbGRvd25fc2VjcwAAAAAAAAYAAAAAAAAAD2V4cGlyYXRpb25fc2VjcwAAAAAGAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    queue: this.txFromJSON<Result<u64>>,
        cancel: this.txFromJSON<Result<void>>,
        expire: this.txFromJSON<Result<void>>,
        execute: this.txFromJSON<Result<Entry>>,
        get_entry: this.txFromJSON<Option<Entry>>,
        get_config: this.txFromJSON<Config>
  }
}