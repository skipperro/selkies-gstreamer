import argparse
from websocket import ws_entrypoint
from webrtc import wr_entrypoint

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode')
    args, unknown = parser.parse_known_args()
    if args.mode == 'webrtc':
      wr_entrypoint()
    else:
      ws_entrypoint()
