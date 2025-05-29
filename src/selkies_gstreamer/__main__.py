import argparse
from selkies_gstreamer.websocket import ws_entrypoint
from selkies_gstreamer.webrtc import wr_entrypoint

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', help="Specify the mode: 'webrtc' or 'websocket'")
    args = parser.parse_args()
    if args.mode == 'webrtc':
      wr_entrypoint()
    else:
      ws_entrypoint()

if __name__ == "__main__":
    main()
