#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    xdr::{ContractEventBody, ScSymbol, ScVal},
    Address, Bytes, Env, IntoVal,
};

const COOLDOWN: u64 = 180; // ADR-0001 default: 3 min
const EXPIRATION: u64 = 1800; // ADR-0001 default: 30 min
const T0: u64 = 1_700_000_000;

fn setup() -> (Env, DelayModuleClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    let user = Address::generate(&env);
    let id = env.register(DelayModule, (COOLDOWN, EXPIRATION));
    (env.clone(), DelayModuleClient::new(&env, &id), user)
}

fn payload(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0xAB; 4])
}

/// Count events emitted by `contract` whose first topic Symbol is `name`.
/// `#[contractevent]` derives the topic from the struct name (snake_case).
fn event_count(env: &Env, contract: &Address, name: &str) -> usize {
    let want = ScVal::Symbol(ScSymbol(name.try_into().unwrap()));
    env.events()
        .all()
        .filter_by_contract(contract)
        .events()
        .iter()
        .filter(|e| {
            let ContractEventBody::V0(body) = &e.body;
            body.topics.first() == Some(&want)
        })
        .count()
}

#[test]
fn queue_stores_entry_and_emits_queued_event() {
    let (env, c, user) = setup();

    let id = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));
    assert_eq!(id, 0);
    // Events must be read before the next contract call resets them.
    assert_eq!(event_count(&env, &c.address, "entry_queued"), 1);

    let e = c.get_entry(&id).unwrap();
    assert_eq!(e.user, user);
    assert_eq!(e.kind, OpKind::Transfer);
    assert_eq!(e.amount, 500_0000000);
    assert_eq!(e.payload, payload(&env));
    assert_eq!(e.executable_at, T0 + COOLDOWN);
    assert_eq!(e.expires_at, T0 + EXPIRATION);
}

#[test]
fn execute_succeeds_at_cooldown_boundary_and_reaps_entry() {
    let (env, c, user) = setup();
    let id = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));

    // `executable_at` is inclusive: the first valid instant is exactly
    // queued_at + cooldown.
    env.ledger().set_timestamp(T0 + COOLDOWN);
    let e = c.execute(&id);
    assert_eq!(event_count(&env, &c.address, "entry_executed"), 1);
    assert_eq!(e.user, user);
    assert_eq!(e.payload, payload(&env));

    // Executed entries are gone; the event is the record.
    assert!(c.get_entry(&id).is_none());
}

#[test]
fn execute_before_cooldown_fails() {
    let (env, c, user) = setup();
    let id = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));

    // One second before the boundary the entry is still cooling down.
    env.ledger().set_timestamp(T0 + COOLDOWN - 1);
    let err = c.try_execute(&id).err().unwrap().unwrap();
    assert_eq!(err, Error::CooldownNotElapsed);

    // The failed attempt leaves the entry pending.
    assert_eq!(c.get_entry(&id).unwrap().user, user);
}

#[test]
fn execute_expiry_boundary_is_tight() {
    let (env, c, user) = setup();

    // Last valid instant: expires_at - 1.
    let id = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));
    env.ledger().set_timestamp(T0 + EXPIRATION - 1);
    c.execute(&id);

    // A fresh entry executed exactly at expires_at is void.
    let id2 = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + EXPIRATION);
    let err = c.try_execute(&id2).err().unwrap().unwrap();
    assert_eq!(err, Error::EntryExpired);
}

#[test]
fn user_can_cancel_own_entry_during_cooldown() {
    let (env, c, user) = setup();
    let id = c.queue(&user, &OpKind::Transfer, &500_0000000, &payload(&env));

    // Still inside the cooldown — cancellation is exactly for this window.
    c.cancel(&id);
    assert_eq!(event_count(&env, &c.address, "entry_cancelled"), 1);
    assert!(c.get_entry(&id).is_none());

    // A cancelled entry can never execute.
    env.ledger().set_timestamp(T0 + COOLDOWN);
    let err = c.try_execute(&id).err().unwrap().unwrap();
    assert_eq!(err, Error::EntryNotFound);
}

// An expiration at or below the cooldown would leave an empty execution
// window: every entry dead on arrival. Constructor refuses the deploy.
#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn constructor_rejects_empty_execution_window() {
    let env = Env::default();
    env.register(DelayModule, (EXPIRATION, EXPIRATION));
}

#[test]
fn queue_rejects_invalid_amounts() {
    let (env, c, user) = setup();

    // A transfer of nothing (or less) is meaningless.
    let err = c
        .try_queue(&user, &OpKind::Transfer, &0, &payload(&env))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::InvalidAmount);

    // A config change carries no amount; a nonzero one would corrupt the
    // downstream Spendable computation.
    let err = c
        .try_queue(&user, &OpKind::ConfigChange, &1, &payload(&env))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::InvalidAmount);
}

// The no-admin guarantee: cancellation requires the queuing user's
// authorization, so a third party — even one willing to sign — cannot cancel.
// There is no privileged role in the contract that could override this.
#[test]
fn only_the_queuing_user_can_cancel() {
    let env = Env::default();
    env.ledger().set_timestamp(T0);
    let user = Address::generate(&env);
    let attacker = Address::generate(&env);
    let cid = env.register(DelayModule, (COOLDOWN, EXPIRATION));
    let c = DelayModuleClient::new(&env, &cid);

    let amount = 500_0000000i128;
    env.mock_auths(&[MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "queue",
            args: (&user, OpKind::Transfer, amount, payload(&env)).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let id = c.queue(&user, &OpKind::Transfer, &amount, &payload(&env));

    // The attacker signs `cancel` themselves; `require_auth` is bound to the
    // queuing user, so the host rejects the invocation outright.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "cancel",
            args: (id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(c.try_cancel(&id).is_err());
    assert!(c.get_entry(&id).is_some(), "entry must remain pending");

    // The queuing user's own signature is the only thing that cancels.
    env.mock_auths(&[MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "cancel",
            args: (id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    c.cancel(&id);
    assert!(c.get_entry(&id).is_none());
}

// `execute` is bound to the queuing user the same way `cancel` is: a third
// party cannot fire someone else's queued operation.
#[test]
fn only_the_queuing_user_can_execute() {
    let env = Env::default();
    env.ledger().set_timestamp(T0);
    let user = Address::generate(&env);
    let attacker = Address::generate(&env);
    let cid = env.register(DelayModule, (COOLDOWN, EXPIRATION));
    let c = DelayModuleClient::new(&env, &cid);

    let amount = 500_0000000i128;
    env.mock_auths(&[MockAuth {
        address: &user,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "queue",
            args: (&user, OpKind::Transfer, amount, payload(&env)).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let id = c.queue(&user, &OpKind::Transfer, &amount, &payload(&env));

    env.ledger().set_timestamp(T0 + COOLDOWN);
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &cid,
            fn_name: "execute",
            args: (id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(c.try_execute(&id).is_err());
    assert!(c.get_entry(&id).is_some(), "entry must remain pending");
}

#[test]
fn expire_reaps_dead_entry_and_emits_event() {
    let (env, c, user) = setup();
    let id = c.queue(&user, &OpKind::ConfigChange, &0, &payload(&env));

    // While the entry is live, expire is rejected.
    env.ledger().set_timestamp(T0 + EXPIRATION - 1);
    let err = c.try_expire(&id).err().unwrap().unwrap();
    assert_eq!(err, Error::NotYetExpired);

    // From expires_at on, anyone may reap it — no auth involved.
    env.ledger().set_timestamp(T0 + EXPIRATION);
    c.expire(&id);
    assert_eq!(event_count(&env, &c.address, "entry_expired"), 1);
    assert!(c.get_entry(&id).is_none());

    let err = c.try_execute(&id).err().unwrap().unwrap();
    assert_eq!(err, Error::EntryNotFound);
}
