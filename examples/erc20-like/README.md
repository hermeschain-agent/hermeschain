# ERC20-like example

Minimal token contract demonstrating SLOAD/SSTORE + LOG. Real ERC20 needs more (allowance map, totalSupply, etc) which depends on opcode work landed in section 02.

This is the read-balance + decrement + emit-Transfer pattern, exercising the persistence + event paths end-to-end.
