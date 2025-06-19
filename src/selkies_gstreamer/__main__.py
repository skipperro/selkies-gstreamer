import argparse
import sys
import os
if __name__ == "__main__" and __package__ is None:
    current_script_dir = os.path.dirname(os.path.abspath(__file__))
    package_container_dir = os.path.dirname(current_script_dir)
    if package_container_dir not in sys.path:
        sys.path.insert(0, package_container_dir)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', help="Specify the mode: 'webrtc' or 'websocket'")
    args, unknown = parser.parse_known_args()
    if args.mode == 'webrtc':
      from selkies_gstreamer.webrtc import wr_entrypoint
      wr_entrypoint()
    else:
      from selkies_gstreamer.websocket import ws_entrypoint
      ws_entrypoint()

if __name__ == "__main__":
    main()
